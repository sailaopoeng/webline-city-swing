# AWS hosting

Webline is three static files (`index.html`, `style.css`, `game.js`) with no backend, build step, or third-party requests, so it is served from a private S3 bucket behind CloudFront.

```
GitHub push to main ──► GitHub Actions (OIDC role) ──► S3 bucket (private)
                                                         │  Origin Access Control
browser ──► Route 53 alias ──► CloudFront (ACM TLS) ◄────┘
```

`webline-site.yaml` creates everything: bucket, CloudFront distribution, ACM certificate (DNS-validated in your hosted zone), optional Route 53 A/AAAA alias records, and an IAM role that only `main` of this repository can assume. No AWS keys are stored in GitHub. Expected cost for a small game is well under US$1/month (Route 53 zone fee aside).

## One-time setup (AWS web console)

Use the AWS account that owns the `sailaopoeng.com` hosted zone. Console labels shift occasionally; the steps below name what to look for.

**0. Merge to `main` first.** The workflow and the deploy role only work from `main`, so merge the branch with these files before continuing. The first run after merging is skipped because the variables aren't set yet.

**1. Note what exists (nothing is changed yet).**
- Route 53 → *Hosted zones* → `sailaopoeng.com`. Find the `webline-city-swing.sailaopoeng.com` record and write down its type and value (likely a CNAME to `*.chatgpt.site`); you need this to roll back.
- IAM → *Identity providers*. If `token.actions.githubusercontent.com` is listed, open it and copy its ARN; otherwise there's nothing to copy.

**2. Download the template.** On GitHub open `infra/aws/webline-site.yaml` → *Download raw file*.

**3. Create the stack.**
- In the top-right region picker choose **US East (N. Virginia) us-east-1**. CloudFront's certificate must live there.
- CloudFormation → *Create stack* → *With new resources (standard)* → *Choose an existing template* → *Upload a template file* → choose `webline-site.yaml` → *Next*.
- Stack name: `webline-city-swing`. Parameters:
  - `DomainName`: keep `webline-city-swing.sailaopoeng.com`
  - `HostedZoneId`: pick `sailaopoeng.com` from the dropdown
  - `CreateDnsRecords`: **false**
  - `GitHubRepository` / `GitHubBranch`: keep `sailaopoeng/webline-city-swing` / `main`
  - `ExistingGitHubOidcProviderArn`: the ARN from step 1, or blank if there was none
- *Next* → leave the options page as is → *Next* → tick **"I acknowledge that AWS CloudFormation might create IAM resources"** → *Submit*.
- Wait for **CREATE_COMPLETE** (often 5–15 minutes; the certificate and CloudFront are the slow parts). If it fails, the *Events* tab shows the first red reason. Delete the failed stack before retrying, and delete any leftover empty `webline-city-swing-sitebucket-…` bucket in S3.

**4. Copy the outputs.** Open the stack → *Outputs* tab. Keep `DeployRoleArn`, `BucketName`, `DistributionId`, and `DistributionDomainName` handy.

**5. Add GitHub variables.** Repository → *Settings* → *Secrets and variables* → *Actions* → *Variables* tab → *New repository variable*, three times:

| Name | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
| `AWS_S3_BUCKET` | `BucketName` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` |

**6. First deploy and test.** Repository → *Actions* → *Deploy to AWS* → *Run workflow* → branch `main` → *Run workflow*. When it's green, open `https://<DistributionDomainName>/` and play a run. The ChatGPT-hosted domain is still live at this point.

**7. Switch the domain.**
- If the custom domain is configured inside ChatGPT Sites, remove it there first.
- Route 53 → `sailaopoeng.com` → select only the `webline-city-swing.sailaopoeng.com` record from step 1 → *Delete record*. Do **not** delete the `_…` CNAME the stack added; it keeps the certificate valid.
- CloudFormation → `webline-city-swing` → *Update* → *Use existing template* → *Next* → set `CreateDnsRecords` to **true** → *Next* → *Next* → tick the IAM acknowledgement → *Submit*. Wait for **UPDATE_COMPLETE**.
- After a few minutes, open `https://webline-city-swing.sailaopoeng.com/` in a private window. Rollback: update the stack back to `false` and recreate the record you wrote down in step 1.

**8. Add a spending alert.** *Billing and Cost Management* → *Budgets* → *Create budget* → *Use a template* → *Monthly cost budget*, amount `3`, your email → *Create budget*.

**9. Retire Sites.** Once the domain serves from CloudFront, the ChatGPT Sites project, `.openai/hosting.json`, and `dist/` can be removed.

## One-time setup (AWS CLI alternative)

Requires the AWS CLI logged in to the account that owns the `sailaopoeng.com` hosted zone.

1. **Create the stack** (must be `us-east-1`; ACM certificates for CloudFront only work there). DNS records stay off so the live ChatGPT-hosted site is untouched:

   ```bash
   HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name sailaopoeng.com \
     --query 'HostedZones[0].Id' --output text | cut -d/ -f3)

   aws cloudformation deploy --region us-east-1 \
     --stack-name webline-city-swing \
     --template-file infra/aws/webline-site.yaml \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides HostedZoneId=$HOSTED_ZONE_ID CreateDnsRecords=false
   ```

   If the account already has a GitHub OIDC provider (`aws iam list-open-id-connect-providers`), add `ExistingGitHubOidcProviderArn=<its ARN>`. Certificate validation usually takes a few minutes.

2. **Read the outputs** and add them as GitHub repository *variables* (Settings → Secrets and variables → Actions → Variables):

   ```bash
   aws cloudformation describe-stacks --region us-east-1 --stack-name webline-city-swing \
     --query 'Stacks[0].Outputs' --output table
   ```

   | Variable | Output |
   | --- | --- |
   | `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
   | `AWS_S3_BUCKET` | `BucketName` |
   | `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` |

3. **First deploy:** Actions → *Deploy to AWS* → *Run workflow* on `main`. Open `https://<DistributionDomainName>/` and play a run to confirm.

4. **Switch the domain.** In Route 53, delete the existing `webline-city-swing.sailaopoeng.com` record that points to `*.chatgpt.site`, then let the stack create the CloudFront alias records:

   ```bash
   aws cloudformation deploy --region us-east-1 \
     --stack-name webline-city-swing \
     --template-file infra/aws/webline-site.yaml \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides HostedZoneId=$HOSTED_ZONE_ID CreateDnsRecords=true
   ```

   Expect a short gap (roughly the old record's TTL) while DNS changes. If CloudFront reports `CNAMEAlreadyExists` in step 1, the domain is still attached to the ChatGPT Sites project; remove the custom domain there first.

5. Once the domain serves from CloudFront, the ChatGPT Sites project, `.openai/hosting.json`, and `dist/` can be retired.

## Everyday deploys

Push changes to `index.html`, `style.css`, or `game.js` on `main`. The workflow runs `node --check game.js`, uploads only those three files (`index.html` with `no-cache`, CSS/JS with a 5-minute browser cache), removes stale objects, and invalidates CloudFront. Bump the `?v=` query in `index.html` when CSS or JS changes so returning browsers pick it up at once.

Bucket versioning keeps 30 days of previous objects for manual rollback; reverting the commit and pushing is the normal rollback.

## Extending

New static files (audio, sprites, extra pages) need adding to the *Stage site files* step and the workflow `paths` filter. A future backend (leaderboard API, etc.) can be added as another CloudFront origin/behavior such as `/api/*` pointing to API Gateway or a Lambda function URL, keeping one domain and avoiding CORS.
