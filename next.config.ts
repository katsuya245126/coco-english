import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  /**
   * `ffmpeg-static` resolves its binary as `path.join(__dirname, "ffmpeg")` at
   * runtime, and the package does not publish the file (it is fetched by a
   * postinstall script). @vercel/nft traces `import`/`require`/`fs` usage
   * statically, so it sees index.js and package.json but never the executable —
   * which shipped a function whose ffmpeg spawn failed with ENOENT.
   *
   * Verified against a local production-mode build: without this include the
   * audio route's .nft.json omits the binary; with it, the executable is traced
   * at mode 755.
   * `scripts/assert-ffmpeg-traced.mjs` runs on postbuild so a silent regression
   * fails the build instead of the student's pronunciation score.
   */
  outputFileTracingIncludes: {
    "/student/missions/*/audio": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
