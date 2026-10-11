// 고른 사진을 비율(aw:ah)에 맞춰 자르고 줄인다. 세로로 긴 사진은 얼굴이 있는 위쪽을 살린다.
export async function cropImage(file, aw, ah, maxWidth) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    let cw = W;
    let ch = (W * ah) / aw;
    if (ch > H) {
      ch = H;
      cw = (H * aw) / ah;
    }
    const outW = Math.min(maxWidth, Math.round(cw));
    const outH = Math.round((outW * ah) / aw);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext("2d").drawImage(img, (W - cw) / 2, (H - ch) * 0.25, cw, ch, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
