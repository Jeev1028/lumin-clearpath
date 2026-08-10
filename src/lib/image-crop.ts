// Canvas-based crop helper for the avatar cropping dialog. Client-only.

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

export type PixelCrop = { x: number; y: number; width: number; height: number };

/** Renders the selected crop area from `imageSrc` onto a square canvas and
 * returns it as a PNG blob, ready to upload. */
export async function getCroppedImageBlob(
  imageSrc: string,
  crop: PixelCrop,
  outputSize = 512,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputSize, outputSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not process the image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
