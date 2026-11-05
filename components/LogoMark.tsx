import Image from 'next/image';

export function LogoMark({ title = 'PHOTO-TEXTE' }: { title?: string }) {
  return (
    <Image
      className="brand-mark-image"
      src="/icon-192.png"
      width={64}
      height={64}
      alt={title}
      priority
    />
  );
}
