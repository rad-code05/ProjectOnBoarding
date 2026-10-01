import Image from "next/image";

export type LogoProps = {
  /** sm = top bar (60×22), md = mobile header (88×32), lg = brand panel (119×44). */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: { width: 60, height: 22 },
  md: { width: 88, height: 32 },
  lg: { width: 119, height: 44 },
} as const;

/** White Laine wordmark — only place it on ink (black) surfaces. */
export function Logo({ size = "md", className }: LogoProps) {
  const { width, height } = sizes[size];
  return (
    <Image
      src="/brand/laine-logo-white.png"
      alt="Laine"
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}
