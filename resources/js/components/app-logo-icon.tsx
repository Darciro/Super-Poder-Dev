import type { SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg
            width="300"
            height="300"
            viewBox="0 0 100 100"
            aria-hidden="true"
            {...props}
        >
            <path
                d="M50 4 L92 16 L88 58 Q84 80 50 96 Q16 80 12 58 L8 16 Z"
                fill="#0E447C"
            ></path>
            <g
                fill="none"
                stroke="#FB5303"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <polyline points="32,36 20,50 32,64"></polyline>
                <polyline points="68,36 80,50 68,64"></polyline>
            </g>
            <polygon
                points="52,24 61,24 54,43 62,43 44,76 48,54 40,54"
                fill="#FFFFFF"
            ></polygon>
        </svg>
    );
}
