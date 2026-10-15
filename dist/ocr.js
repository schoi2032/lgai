// The neural OCR model reads image pixels locally. No user photo leaves this browser.
export class PhotoReader {
  constructor() { this.worker = null; }

  async read(image, onProgress = () => {}) {
    if (!globalThis.Tesseract) throw new Error("사진 분석기를 불러오지 못했어요. 페이지를 새로고침해 주세요.");
    let worker, timeout;
    try {
      if (!this.worker) {
        let fail;
        const failure = new Promise((_, reject) => { fail = reject; });
        const created = globalThis.Tesseract.createWorker("eng+kor", 1, {
        workerPath: new URL("./vendor/worker.min.js", import.meta.url).href,
        corePath: new URL("./vendor/", import.meta.url).href,
        langPath: new URL("./vendor/lang/", import.meta.url).href,
        logger: message => onProgress(message.status === "recognizing text" ? `사진 속 글자 읽는 중… ${Math.round(message.progress * 100)}%` : "사진 인식 모델 준비 중…"),
        errorHandler: () => fail(new Error("ocr_failed"))
        });
        this.worker = Promise.race([created, failure]);
      }
      const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("ocr_timeout")), 120000); });
      worker = await Promise.race([this.worker, deadline]);
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      const { data } = await Promise.race([worker.recognize(image, {}, { blocks: true }), deadline]);
      const lines = (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []);
      return { text: data.text.trim(), lines: lines.map(line => ({ text: line.text.trim(), confidence: line.confidence, bbox: line.bbox })) };
    } catch (_) {
      this.worker = null;
      if (worker) await worker.terminate().catch(() => {});
      throw new Error("사진 속 글자를 읽지 못했어요. 인터넷 연결을 확인하고 선명한 사진으로 다시 시도해 주세요.");
    } finally { clearTimeout(timeout); }
  }
}
