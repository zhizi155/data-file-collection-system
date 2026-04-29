"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchSelectProps {
  /** 单选时为 string，多选时为 string[] */
  value: string | string[]
  onValueChange: (value: string | string[]) => void
  placeholder?: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
  searchPlaceholder?: string
  maxDisplayItems?: number
  showClearButton?: boolean
  /** 是否多选模式，默认 false */
  multiple?: boolean
  /** 是否显示全选按钮（多选模式下生效），默认 false */
  showSelectAll?: boolean
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
  showClearButton = true,
  multiple = false,
  showSelectAll = false,
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
  // 多选模式或选项较多时显示搜索框
  const showSearch = multiple || allOptions.length > maxDisplayItems

  // 统一为数组处理
  const selectedValues: string[] = React.useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : []
    } else {
      return value ? [value as string] : []
    }
  }, [value, multiple])

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

  const handleSelect = (optionValue: string) => {
    if (multiple) {
      // 多选模式
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue]
      onValueChange(newValues)
    } else {
      // 单选模式
      onValueChange(optionValue)
      setOpen(false)
      setSearch("")
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange(multiple ? [] : "")
  }

  // 获取显示的文本
  const displayText = () => {
    if (selectedValues.length === 0) return placeholder
    if (multiple) {
      if (selectedValues.length === 1) {
        const selected = allOptions.find((opt) => opt.value === selectedValues[0])
        return selected?.label || placeholder
      }
      return `已选择 ${selectedValues.length} 项`
    } else {
      const selected = allOptions.find((opt) => opt.value === selectedValues[0])
      return selected?.label || placeholder
    }
  }

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
          open && "ring-2 ring-ring ring-offset-2"
        )}
      >
        <span className={cn("truncate flex-1 text-left", selectedValues.length === 0 && "text-muted-foreground")}>
          {displayText()}
        </span>
        <div className="flex items-center gap-1">
          {selectedValues.length > 0 && showClearButton && (
            <span
              onClick={handleClear}
              className="hover:bg-accent rounded p-0.5"
            >
              <X className="h-3.5 w-3.5 opacity-60" />
            </span>
          )}
          <ChevronDownIcon className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-[200px] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 bg-popover text-popover-foreground rounded-md border shadow-md">
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
          
          {/* 全选选项（多选模式下显示） */}
          {multiple && showSelectAll && filteredOptions.length > 0 && (
            <div className="p-1 border-b">
              <button
                type="button"
                onClick={() => {
                  const allValues = filteredOptions.map((opt) => opt.value)
                  const allSelected = allValues.every((v) => selectedValues.includes(v))
                  if (allSelected) {
                    // 取消全选：移除所有当前显示的选项
                    const newValues = selectedValues.filter((v) => !allValues.includes(v))
                    onValueChange(newValues)
                  } else {
                    // 全选：添加所有当前显示的选项（去重）
                    const newValues = [...new Set([...selectedValues, ...allValues])]
                    onValueChange(newValues)
                  }
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer"
              >
                <span className={cn(
                  "flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center",
                  filteredOptions.every((opt) => selectedValues.includes(opt.value))
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                )}>
                  {filteredOptions.every((opt) => selectedValues.includes(opt.value)) && (
                    <CheckIcon className="h-3 w-3 text-primary-foreground" />
                  )}
                </span>
                <span className={cn(
                  filteredOptions.every((opt) => selectedValues.includes(opt.value)) && "font-medium"
                )}>
                  全选当前页 ({filteredOptions.length})
                </span>
              </button>
            </div>
          )}
          
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                没有找到匹配的选项
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm outline-none transition-colors",
                      option.disabled && "pointer-events-none opacity-50",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {multiple ? (
                      // 多选模式：显示复选框
                      <span className={cn(
                        "flex items-center gap-2 w-full",
                        isSelected && "font-medium"
                      )}>
                        <span className={cn(
                          "flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {isSelected && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
                        </span>
                        <span className="truncate">{option.label}</span>
                      </span>
                    ) : (
                      // 单选模式：显示单选指示器
                      <span className="flex items-center gap-2 truncate">
                        {isSelected && <CheckIcon className="h-4 w-4 flex-shrink-0" />}
                        <span className={cn(isSelected && "font-medium")}>{option.label}</span>
                      </span>
                    )}
                  </button>
                )
              })
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
