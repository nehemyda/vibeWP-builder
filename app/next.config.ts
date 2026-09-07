import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /*
       * Image uploads go through a Server Action, and the default cap is 1MB —
       * so every photograph from a phone or a screen capture failed before the
       * action ran, reported only as "That upload didn't finish".
       *
       * 11mb, not 10: the limit applies to the raw multipart body, so the
       * boundaries and part headers around a 10MB file count towards it. The
       * Next docs suggest 10–20KB of overhead; a whole megabyte is more than
       * enough and costs nothing, since app/actions/media.ts refuses anything
       * over 10MB on its own terms and returns a message that says so.
       */
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
