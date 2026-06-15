const MAX_STORY_IMAGE_BYTES = 8 * 1024 * 1024;
const TARGET_IMAGE_MAX_DIMENSION = 1600;
const COMPRESSION_QUALITY = 0.8;

export function validateStoryImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_STORY_IMAGE_BYTES) {
    throw new Error("Story images must be 8 MB or smaller.");
  }
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > TARGET_IMAGE_MAX_DIMENSION) {
          height = Math.round((height * TARGET_IMAGE_MAX_DIMENSION) / width);
          width = TARGET_IMAGE_MAX_DIMENSION;
        }
      } else {
        if (height > TARGET_IMAGE_MAX_DIMENSION) {
          width = Math.round((width * TARGET_IMAGE_MAX_DIMENSION) / height);
          height = TARGET_IMAGE_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to compress image"));
          }
        },
        "image/jpeg",
        COMPRESSION_QUALITY,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadStoryImage(
  file: File,
  getUploadUrl: () => Promise<string>,
) {
  validateStoryImageFile(file);

  // Compress image before upload
  let uploadBlob: Blob = file;
  try {
    uploadBlob = await compressImage(file);
    console.log(`Compressed image: ${file.size} -> ${uploadBlob.size} bytes`);
  } catch (e) {
    console.warn("Failed to compress image, uploading original", e);
  }

  const uploadUrl = await getUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": uploadBlob.type || "application/octet-stream" },
    body: uploadBlob,
  });
  if (!response.ok) {
    throw new Error("Unable to upload image.");
  }
  const result = await response.json() as { storageId?: string };
  if (!result.storageId) {
    throw new Error("Image upload did not return a storage id.");
  }
  return result.storageId;
}
