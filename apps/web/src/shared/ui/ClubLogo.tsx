interface ClubLogoProps {
  size: number;
}

export function ClubLogo({ size }: ClubLogoProps) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <img
        src="/img/logo.png"
        alt="Club Ajedrez Puerta Elvira"
        width={size}
        height={size}
        className="-m-[6%] block size-[112%] max-w-none"
      />
    </span>
  );
}
