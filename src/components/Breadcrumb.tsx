import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const separator = i > 0 ? <span key={`sep-${i}`}>{' › '}</span> : null

        let node: React.ReactNode
        if (isLast) {
          node = <span key={item.label}>{item.label}</span>
        } else if (item.href) {
          node = (
            <Link key={item.label} href={item.href} style={{ color: '#888', textDecoration: 'none' }}>
              {item.label}
            </Link>
          )
        } else if (item.onClick) {
          node = (
            <button
              key={item.label}
              onClick={item.onClick}
              style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}
            >
              {item.label}
            </button>
          )
        } else {
          node = <span key={item.label}>{item.label}</span>
        }

        return (
          <span key={i}>
            {separator}
            {node}
          </span>
        )
      })}
    </div>
  )
}
