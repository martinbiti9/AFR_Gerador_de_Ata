import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
  alignment?: 'center' | 'left';
}

export function AfonsoFrancaLogo({ collapsed = false, className = '', alignment = 'left' }: LogoProps) {
  if (collapsed) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} title="Afonso França Engenharia">
        <svg 
          viewBox="0 0 100 100" 
          className="w-9 h-9 drop-shadow-xs" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Rounded base icon background */}
          <rect width="100" height="100" rx="22" fill="#1b2e63" />
          
          {/* Right half lighter tone */}
          <path d="M50 0H78C90.15 0 100 9.85 100 22V78C100 90.15 90.15 100 78 100H50V0Z" fill="#a4b7dd" />
          
          {/* Stylized 'AF' monogram with dynamic cross-swoop */}
          {/* 'A' left leg & top */}
          <path 
            d="M20 78L43 24H54L54 78H43V58H31L26 78H20Z" 
            fill="#FFFFFF" 
          />
          {/* 'F' right part and crossbar */}
          <path 
            d="M50 24H80V35H58V47H76V57H58V78H48V24H50Z" 
            fill="#1b2e63" 
          />
          {/* Swoop blade cut */}
          <path 
            d="M17 56C30 52 45 44 65 37C55 46 38 58 24 64C21 61 18 58 17 56Z" 
            fill="#FFFFFF" 
          />
        </svg>
      </div>
    );
  }

  const alignClasses = alignment === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <div className={`flex flex-col ${alignClasses} ${className}`}>
      {/* Brand Icon */}
      <div className="flex items-center gap-3">
        <svg 
          viewBox="0 0 100 100" 
          className="w-10 h-10 shrink-0 drop-shadow-xs" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Rounded base icon background */}
          <rect width="100" height="100" rx="22" fill="#1b2e63" />
          
          {/* Right half lighter tone */}
          <path d="M50 0H78C90.15 0 100 9.85 100 22V78C100 90.15 90.15 100 78 100H50V0Z" fill="#a4b7dd" />
          
          {/* Stylized 'A' left leg & top */}
          <path 
            d="M20 78L43 24H54L54 78H43V58H31L26 78H20Z" 
            fill="#FFFFFF" 
          />
          {/* 'F' right bars */}
          <path 
            d="M50 24H80V35H58V47H76V57H58V78H48V24H50Z" 
            fill="#1b2e63" 
          />
          {/* Swoop blade */}
          <path 
            d="M17 56C30 52 45 44 65 37C55 46 38 58 24 64C21 61 18 58 17 56Z" 
            fill="#FFFFFF" 
          />
        </svg>

        {/* Brand Typography */}
        <div className="flex flex-col">
          <span className="text-[13px] font-black tracking-tight text-[#1b2e63] uppercase leading-none font-sans">
            Afonso França
          </span>
          <span className="text-[9px] font-bold tracking-[0.22em] text-[#1b2e63]/80 uppercase mt-1 leading-none">
            Engenharia
          </span>
        </div>
      </div>
    </div>
  );
}
