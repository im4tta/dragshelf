# Third-party notices

Drag Shelf's text recognition (OCR) uses these open-source works. The models are not shipped inside the installers; Drag Shelf downloads them once, from the pinned revisions below, when you first use OCR, and verifies each file's SHA-256 before use.

| Component | Author | License | Source |
|---|---|---|---|
| Chakkhu ចក្ខុ Khmer + English text-line OCR (int8 ONNX encoder, decoder, tokenizer) | Ing Muyleang | Apache-2.0 | [muyleanging/Chakkhu-OCR-Khmer-ONNX @ 7a2c283f](https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX/tree/7a2c283f9f2e73198d822f9e6baf3a396df3bd01) |
| KhmerOCR text detector (`det.onnx`) | Seanghay Yath | MIT | [github.com/seanghay/KhmerOCR](https://github.com/seanghay/KhmerOCR), mirrored at [im4tta/tools123 @ a50a636](https://github.com/im4tta/tools123/tree/a50a6361320abd05021ddb6707de71c8cf59f651/public/models/khmerocr) |
| Chakkhu reader and Khmer normaliser, ported to JavaScript (`src/ocr/chakkhu-core.js`, `src/ocr/engine.js`) | 123 Toolbox (im4tta/tools123), after Ing Muyleang's reference `chakkhu_onnx.py` / `khnormal.py` | MIT / Apache-2.0 | [im4tta/tools123](https://github.com/im4tta/tools123) |
| ONNX Runtime Web (WebAssembly runtime, bundled) | Microsoft | MIT | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) |
| yauzl (reading backup ZIPs) | Josh Wolfe | MIT | [thejoshwolfe/yauzl](https://github.com/thejoshwolfe/yauzl) |

The Apache-2.0 license text is available at <https://www.apache.org/licenses/LICENSE-2.0>.
