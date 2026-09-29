# Cloudinary setup for NOVA Store

## Official references

- Upload API: https://cloudinary.com/documentation/upload_images
- Upload presets: https://cloudinary.com/documentation/upload_presets

## Required Render environment variables

- `CLOUDINARY_CLOUD_NAME`: the Cloudinary cloud name; safe to expose in the browser upload endpoint.
- `CLOUDINARY_UPLOAD_PRESET`: an **unsigned** upload preset dedicated to NOVA Store; the preset name is visible in browser code.

Do not put `CLOUDINARY_API_SECRET` in browser code or commit it to GitHub.

## Recommended unsigned preset restrictions

- Allowed formats: `jpg,png,webp`
- Maximum file size: `10485760` bytes (10 MB)
- Disable custom public IDs (`disallow_public_id: true`)
- Use an incoming transformation to normalize large images if desired.

The browser uploads to:

`https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`

using multipart fields `file` and `upload_preset`; the app stores the returned `secure_url` in the product's `images` list.
