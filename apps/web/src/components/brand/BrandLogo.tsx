import Image from 'next/image';
import logoImage from '@/assets/collabry.svg';

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  logoClassName?: string;
};

const WIDTH_MAP = {
  sm: 96,
  md: 148,
  lg: 200,
  xl: 600,
} as const;

export const BrandLogo = ({
  size = 'md',
  showText = true,
  className = '',
  logoClassName = '',
}: BrandLogoProps) => {
  const width = WIDTH_MAP[size];
  const height = Math.round((width * 2) / 3);

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <Image
        src={logoImage}
        alt="Collabry logo"
        width={width}
        height={height}
        priority
        className={`object-contain drop-shadow-[0_10px_18px_rgba(0,58,143,0.35)] ${logoClassName}`}
      />
      {showText ? (
        <span className="text-2xl font-bold leading-none text-slate-900">
          Colla<span className="neon-title">bry</span>
        </span>
      ) : null}
    </div>
  );
};
