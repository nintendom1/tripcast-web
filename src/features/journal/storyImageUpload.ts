const MAX_STORY_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateStoryImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_STORY_IMAGE_BYTES) {
    throw new Error("Story images must be 8 MB or smaller.");
  }
}

export async function uploadStoryImage(
  file: File,
  getUploadUrl: () => Promise<string>,
) {
  validateStoryImageFile(file);
  const uploadUrl = await getUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
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
