import Image from 'next/image'

const leafPinImage = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/images%20%281%29-FLG2PoDbJ10Wk8r2vffJ4KQKanxxJZ.jpg'

export function LeafPinMark() {
  return (
    <Image
      className="brand-leaf-mark"
      src={leafPinImage}
      alt=""
      aria-hidden="true"
      width={32}
      height={32}
      unoptimized
    />
  )
}
