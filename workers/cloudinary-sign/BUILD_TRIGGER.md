# Cloudflare Worker build trigger

This file records the redeploy trigger after updating Cloudflare Builds to target `feature/cloudinary-image-sync-v1` with root directory `workers/cloudinary-sign`.

Expected settings:
- Branch: `feature/cloudinary-image-sync-v1`
- Root directory: `workers/cloudinary-sign`
- Build command: none
- Deploy command: `npx wrangler deploy`

This commit changes no runtime functionality. Keep `CLOUDINARY_API_SECRET` as an encrypted runtime secret, not a plaintext build variable. Check the new build history and actual Worker URL before integrating the frontend.
