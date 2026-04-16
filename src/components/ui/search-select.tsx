"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
  searchPlaceholder?: string
  maxDisplayItems?: number
}

interface SearchSelectOption {
  value: string
  label: string
  disabled?: boolean
}

function SearchSelect({
  value,
  onValueChange,
  placeholder = "选择...",
  children,
  className,
  disabled,
  searchPlaceholder = "搜索...",
  maxDisplayItems = 8,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const getOptions = (): SearchSelectOption[] => {
    const options: SearchSelectOption[] = []
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const childEl = child as React.ReactElement<{ value: string; children?: React.ReactNode; disabled?: boolean }>
        if (childEl.type === SearchSelectItem) {
          options.push({
            value: childEl.props.value,
            label: String(childEl.props.children || ""),
            disabled: childEl.props.disabled,
          })
        }
      }
    })
    return options
  }

  const allOptions = getOptions()
  const showSearch = allOptions.length > maxDisplayItems

  const filteredOptions = search
    ? allOptions.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
    : allOptions

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  React.useEffect(() => {
    if (open && showSearch && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open, showSearch])

  const selectedOption = allOptions.find((opt) => opt.value === value)

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(!open)
          setSearch("")
        }}
        className={cn(
          "border-input data-[placeholder]:text-muted-foreground flex items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 min-w-[120px]",
          open && "ring-2 ring-ring ring-offset-2",
          className
        )}
      >
        <span className={cn("truncate flex-1 text-left", !selectedOption && "text-muted-foreground")}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 opacity-50 transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-[160px] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 bg-popover text-popover-foreground rounded-md border shadow-md">
          {showSearch && (
            <div className="p-2 border-b">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
          
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                没有找到匹配的选项
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    onValueChange(option.value)
                    setOpen(false)
                    setSearch("")
                  }}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm outline-none transition-colors",
                    option.disabled && "pointer-events-none opacity-50",
                    option.value === value
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {option.value === value && <CheckIcon className="h-4 w-4 flex-shrink-0" />}
                    <span className="truncate">{option.label}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchSelectItem({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return <option {...props} className={className} />
}

export { SearchSelect, SearchSelectItem }
