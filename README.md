# LB Presigned

A FiveM script to generate presigned URLs for uploading files to S3.

## Configuration

### Cloudflare R2

To use Cloudflare R2, add the following convars to your server.cfg:

```cfg
set LB_R2_BUCKET bucket_name
set LB_R2_ACCOUNT_ID account_id
set LB_R2_ACCESS_KEY_ID access_key_id
set LB_R2_SECRET_ACCESS_KEY secret_access_key
set LB_R2_DOMAIN r2.example.com
```

You can get your tokens at https://developers.cloudflare.com/r2/api/tokens

### AWS S3

To use AWS S3, add the following convars to your server.cfg:

```cfg
set LB_S3_BUCKET bucket_name
set LB_S3_REGION region
set LB_S3_ACCESS_KEY_ID access_key_id
set LB_S3_SECRET_ACCESS_KEY secret_access_key
set LB_S3_DOMAIN s3.example.com # optional
```

You can get your tokens at https://aws.amazon.com/s3/

### RustFS (self-hosted S3)

RustFS uses the existing S3 configuration with a custom endpoint. Add these convars to your `server.cfg` **before** starting `lb-presigned`, and replace the example values:

```cfg
set LB_S3_BUCKET "bucket_name"
set LB_S3_REGION "us-east-1"
set LB_S3_ACCESS_KEY_ID "your_access_key_id"
set LB_S3_SECRET_ACCESS_KEY "your_secret_access_key"
set LB_S3_ENDPOINT "https://s3.example.com"
# Optional public base URL for this bucket (include the bucket path if needed):
# set LB_S3_DOMAIN "https://cdn.example.com/bucket_name"
```

- `LB_S3_ENDPOINT` is the **S3 API** URL, without the bucket name. RustFS defaults to port `9000`; port `9001` is the management console. For a local test, an endpoint such as `http://192.168.1.10:9000` works; use HTTPS with a trusted certificate for browser uploads in production. Omitting the scheme defaults to HTTPS.
- The endpoint must be reachable by the uploading players, since they upload directly to this address. Do not use `localhost` or a Docker-only hostname for remote players. A reverse proxy must preserve the signed host, path and query parameters, and allow `PUT` and CORS preflight requests.
- Set `LB_S3_REGION` to the RustFS signing region (`RUSTFS_REGION`, default `us-east-1`). Create the bucket first and grant the configured access key `s3:PutObject` on `arn:aws:s3:::bucket_name/*`.
- Custom endpoints automatically enable path-style URLs: `https://s3.example.com/bucket_name/file.webp`. No wildcard bucket DNS is required. Without `LB_S3_DOMAIN`, `fileUrl` uses this same address. With `LB_S3_DOMAIN`, `fileUrl` is `<LB_S3_DOMAIN>/<filename>`; this setting does not change the upload endpoint.
- `fileUrl` is an unsigned, persistent read URL. Allow anonymous `s3:GetObject` for the uploaded objects through a bucket policy, or serve them through a public CDN/proxy configured in `LB_S3_DOMAIN`. A presigned upload alone does not make objects publicly readable. Do not grant anonymous write access.
- Configure CORS on RustFS for the actual LB Phone/Tablet browser origins. The S3 API setting is `RUSTFS_CORS_ALLOWED_ORIGINS` (comma-separated origins); ensure preflight permits `PUT` and the upload's `Content-Type` header. The console's CORS setting is separate. Check the browser's `Origin` header to determine which origins to allow.
- A fully configured Cloudflare R2 provider still takes priority over S3. Remove the old `LB_R2_*` configuration when switching from R2 to RustFS.

The `GeneratePresignedUrl` export, its arguments, its return fields and the 60-second upload URL expiry are unchanged. AWS S3 continues to work without `LB_S3_ENDPOINT`.

References: [RustFS JavaScript SDK and presigned PUT URLs](https://docs.rustfs.com/en/developer/sdk/javascript), [S3 configuration and access policies](https://docs.rustfs.com/en/administration/protocols/s3), [CORS configuration](https://docs.rustfs.com/en/administration/cors).

## Installation

1. Download the latest release from the [releases page](https://github.com/lbphone/lb-presigned/releases/latest/download/lb-presigned.zip)
2. Add the script to your `resources` folder
3. Add `start lb-presigned` to your `server.cfg`
4. [Configure](#configuration) your credentials as described above
5. Start your server, or run `refresh` and `ensure lb-presigned` in your server console

### Building from source

After modifying the source, build the server script with [Bun](https://bun.sh):

```sh
cd node
bun install --frozen-lockfile
bun run build.ts
```

This generates `server/index.js`, which FiveM loads through `fxmanifest.lua`. Restart the resource after building or changing its convars.

## Usage

### Exports

`GeneratePresignedUrl(mimeType: string): { presignedUrl: string, fileUrl: string }`

```lua
local result = exports["lb-presigned"]:GeneratePresignedUrl("image/webp")

print(result.presignedUrl) -- URL to upload the file
print(result.fileUrl) -- URL to access the file after it's uploaded
```

### LB Tablet

> [!IMPORTANT]
> This requires LB Tablet v1.6.0 or higher.

1. [Install](#installation) & [configure](#configuration) LB Presigned as described above
2. Set all `Config.UploadMethod` to `LBPresigned`
3. Restart your server, or run `ensure lb-tablet` in your server console

### LB Phone

> [!IMPORTANT]
> This requires LB Phone v2.5.5 or higher.

1. [Install](#installation) & [configure](#configuration) LB Presigned as described above
2. Set all `Config.UploadMethod` to `LBPresigned`
3. Restart your server, or run `ensure lb-phone` in your server console
