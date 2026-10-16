import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Spinner } from "../ui/controls";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Scrollable, fit-to-width rendering of every page of a PDF blob URL. */
export function PdfPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <Document
        file={src}
        loading={<Spinner />}
        onLoadSuccess={(doc) => setPages(doc.numPages)}
      >
        {width > 0 &&
          Array.from({ length: pages }, (_, i) => (
            <div key={i} style={{ marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
              <Page pageNumber={i + 1} width={width} />
            </div>
          ))}
      </Document>
    </div>
  );
}
