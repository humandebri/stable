"use client";

import { useEffect, useState } from "react";

type EmbedPreviewProps = {
  src: string;
  title: string;
  className?: string;
};

export function EmbedPreview({ src, title, className }: EmbedPreviewProps) {
  const [height, setHeight] = useState(680);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "paylancer:height") return;
      if (typeof event.data.height === "number" && event.data.height > 0) {
        setHeight(event.data.height);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      src={src}
      title={title}
      className={className}
      style={{ border: "0", backgroundColor: "#ffffff", height }}
      scrolling="no"
      allow="clipboard-write"
    />
  );
}
