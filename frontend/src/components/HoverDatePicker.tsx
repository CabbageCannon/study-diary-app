import { CalendarBlankIcon } from "@phosphor-icons/react/CalendarBlank";
import { CaretLeftIcon } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { useEffect, useMemo, useState } from "react";

import { HoverPopover } from "./HoverPopover";

interface HoverDatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function toDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(parseDate(value));
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(value);
}

function buildCalendarDays(month: Date) {
  const firstWeekday = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: firstWeekday + count }, (_, index) => (index < firstWeekday ? null : new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1)));
}

export function HoverDatePicker({ value, onChange }: HoverDatePickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseDate(value)));
  const todayValue = toDateValue(new Date());
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  useEffect(() => {
    setVisibleMonth(startOfMonth(parseDate(value)));
  }, [value]);

  function moveMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <HoverPopover
      className="hover-date-picker"
      panelAriaLabel="选择学习日期"
      panelClassName="date-picker-panel"
      renderTrigger={({ ref, expanded, onClick, onFocus, onKeyDown }) => (
        <button
          aria-expanded={expanded}
          aria-haspopup="dialog"
          className="date-picker-trigger"
          onClick={onClick}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          ref={ref}
          type="button"
        >
          <CalendarBlankIcon aria-hidden="true" size={17} weight="bold" />
          <span>{formatDate(value)}</span>
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="date-picker-header">
            <button aria-label="上一个月" className="date-picker-month-button" onClick={() => moveMonth(-1)} type="button">
              <CaretLeftIcon aria-hidden="true" size={17} weight="bold" />
            </button>
            <strong>{formatMonth(visibleMonth)}</strong>
            <button aria-label="下一个月" className="date-picker-month-button" onClick={() => moveMonth(1)} type="button">
              <CaretRightIcon aria-hidden="true" size={17} weight="bold" />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="date-picker-days">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <span aria-hidden="true" className="date-picker-day-placeholder" key={`placeholder-${index}`} />;
              }
              const dayValue = toDateValue(day);
              const isSelected = dayValue === value;
              const isToday = dayValue === todayValue;
              const className = [
                "date-picker-day",
                isSelected ? "date-picker-day-selected" : "",
                isToday ? "date-picker-day-today" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  aria-pressed={isSelected}
                  className={className}
                  key={dayValue}
                  onClick={() => {
                    onChange(dayValue);
                    close();
                  }}
                  type="button"
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-picker-footer">
            <button
              className="button-tertiary"
              onClick={() => {
                onChange(todayValue);
                close();
              }}
              type="button"
            >
              回到今天
            </button>
          </div>
        </>
      )}
    </HoverPopover>
  );
}
