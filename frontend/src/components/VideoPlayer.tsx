import { useMemo, useState } from 'react';

interface VideoPlayerProps {
  /** IPFS CID of the PoD video evidence. */
  cid: string;
  /** Optional poster/thumbnail image URL. */
  thumbnail?: string;
  /** Optional title shown above the player. */
  title?: string;
}

const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs/';

function resolveGateway(): string {
  const configured = import.meta.env.VITE_IPFS_GATEWAY as string | undefined;
  const base = configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_GATEWAY;
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Inline HTML5 video player for PoD evidence stored on IPFS.
 * Does not autoplay (accessibility requirement) and shows a fallback
 * message when the gateway is unreachable or the video fails to load.
 */
export default function VideoPlayer({ cid, thumbnail, title }: VideoPlayerProps) {
  const [hasError, setHasError] = useState(false);

  const src = useMemo(() => {
    if (!cid) return '';
    return `${resolveGateway()}${cid}`;
  }, [cid]);

  if (!cid) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No video evidence available.
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Unable to load video evidence.</p>
        <p className="mt-1">
          The IPFS gateway may be unreachable. You can still view the evidence directly at{' '}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {src}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-black">
      {title && (
        <div className="bg-gray-900 px-3 py-2 text-sm font-medium text-white">{title}</div>
      )}
      <video
        className="h-auto w-full"
        src={src}
        poster={thumbnail}
        controls
        preload="metadata"
        playsInline
        onError={() => setHasError(true)}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
