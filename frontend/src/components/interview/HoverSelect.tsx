import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { useRef, type KeyboardEvent } from "react";

import { HoverPopover } from "../HoverPopover";

export interface HoverSelectOption {
  value: string;
  label: string;
}

interface HoverSelectProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyLabel: string;
  options: HoverSelectOption[];
  value: string;
  onChange: (value: string) => void;
  numberGrid?: boolean;
}

export function HoverSelect({
  ariaLabel,
  className = "",
  disabled = false,
  emptyLabel,
  options,
  value,
  onChange,
  numberGrid = false,
}: HoverSelectProps) {
  const selected = options.find((option) => option.value === value);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveOptionFocus(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const { key } = event;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      return;
    }
    event.preventDefault();
    const lastIndex = options.length - 1;
    const nextIndex = key === "ArrowDown"
      ? (currentIndex + 1) % options.length
      : key === "ArrowUp"
        ? (currentIndex - 1 + options.length) % options.length
        : key === "Home"
          ? 0
          : lastIndex;
    optionRefs.current[nextIndex]?.focus();
  }

  return (
    <HoverPopover
      className={`hover-select ${className}`}
      disabled={disabled}
      panelAriaLabel={`${ariaLabel}选项`}
      panelClassName={numberGrid ? "hover-select-panel hover-select-number-grid" : "hover-select-panel"}
      panelRole="listbox"
      renderTrigger={({ ref, expanded, onClick, onFocus, onKeyDown }) => (
        <button
          aria-expanded={expanded}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className="hover-select-trigger"
          disabled={disabled}
          onClick={onClick}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          ref={ref}
          type="button"
        >
          <span>{selected?.label ?? emptyLabel}</span>
          <CaretDownIcon aria-hidden="true" size={16} weight="bold" />
        </button>
      )}
    >
      {({ close }) => options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            aria-selected={isSelected}
            className={isSelected ? "hover-select-option hover-select-option-selected" : "hover-select-option"}
            key={option.value || "empty"}
            onKeyDown={(event) => moveOptionFocus(event, options.indexOf(option))}
            onClick={() => {
              onChange(option.value);
              close();
            }}
            ref={(node) => {
              optionRefs.current[options.indexOf(option)] = node;
            }}
            role="option"
            type="button"
          >
            <span>{option.label}</span>
            {isSelected ? <CheckIcon aria-hidden="true" size={15} weight="bold" /> : null}
          </button>
        );
      })}
    </HoverPopover>
  );
}
