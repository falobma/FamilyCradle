import { MAX_GROWTH_PHOTO_BYTES } from "@familycradle/shared";

export async function encodeGrowthPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
    throw new Error("invalid photo");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("could not read photo"));
    reader.onerror = () => reject(new Error("could not read photo"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = data;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("invalid photo dimensions");
  }
  const scale = Math.min(
    1,
    1280 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("could not process photo");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.6, 0.4]) {
    const encoded = canvas.toDataURL("image/jpeg", quality);
    if (!encoded.startsWith("data:image/jpeg;base64,")) {
      throw new Error("could not encode photo");
    }
    const base64 = encoded.slice("data:image/jpeg;base64,".length);
    const bytes =
      (base64.length * 3) / 4 -
      (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    if (bytes <= MAX_GROWTH_PHOTO_BYTES) return base64;
  }
  throw new Error("photo too large");
}
