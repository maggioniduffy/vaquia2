import Image from "next/image";

/** Renders the light and dark screenshot; CSS (`.lp-light` / `.lp-dark` in globals.css) shows the active one. */
export function ThemedImage({
  name,
  width,
  height,
  alt,
  sizes,
  className,
  priority,
}: {
  name: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src={`/landing/${name}-light.webp`}
        width={width}
        height={height}
        alt={alt}
        sizes={sizes}
        priority={priority}
        className={`lp-light ${className ?? ""}`}
      />
      <Image
        src={`/landing/${name}-dark.webp`}
        width={width}
        height={height}
        alt={alt}
        sizes={sizes}
        priority={priority}
        className={`lp-dark ${className ?? ""}`}
      />
    </>
  );
}
