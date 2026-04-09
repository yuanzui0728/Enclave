type CompressedChatBackgroundImage = {
  file: File;
  width: number;
  height: number;
};

const MAX_EDGE = 1600;
const QUALITY = 0.88;

export async function compressChatBackgroundImage(
  file: File,
): Promise<CompressedChatBackgroundImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件作为聊天背景。");
  }

  const image = await loadImage(file);
  const largestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestEdge > MAX_EDGE ? MAX_EDGE / largestEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器暂不支持背景图压缩。");
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  const fileName = replaceFileExtension(file.name, "webp");

  return {
    file: new File([blob], fileName, { type: blob.type }),
    width,
    height,
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("读取图片失败，请换一张再试。"));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("处理背景图失败，请换一张再试。"));
          return;
        }

        resolve(blob);
      },
      "image/webp",
      QUALITY,
    );
  });
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const normalized = fileName.replace(/\.[^.]+$/, "");
  return `${normalized || "chat-background"}.${nextExtension}`;
}
