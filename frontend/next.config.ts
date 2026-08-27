import type { NextConfig } from "next";

// As fontes são auto-hospedadas pelo next/font, então não precisa liberar domínio externo.
// 'unsafe-inline' em script é o preço de não usar nonce: o Next injeta dados de hidratação
// inline. Ainda assim o CSP barra script de origem externa, iframe e <base> forjado.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

// O Turnstile (CAPTCHA) roda num iframe da Cloudflare e carrega script de lá.
// Sem liberar esse domínio o widget simplesmente não aparece e ninguém se cadastra.
const turnstile = "https://challenges.cloudflare.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${turnstile}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${turnstile}`.trim(),
  `frame-src ${turnstile}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Empacota só o que o servidor precisa em tempo de execução, em vez de arrastar
  // o node_modules inteiro. Derruba a imagem de ~600 MB para ~200 MB, o que importa
  // porque a VM tem 952 MB e sofre a cada publicação.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
