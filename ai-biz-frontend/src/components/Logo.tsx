export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  return (
    <div className={`${dims} rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold`}>
      AI
    </div>
  )
}
