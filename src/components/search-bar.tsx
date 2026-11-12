"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, ArrowRight, TrendingUp } from "lucide-react";
import { jobSuggestions, locationSuggestions } from "@/lib/search";

function SuggestionInput({
  kind,
  value,
  onChange,
}: {
  kind: "job" | "location";
  value: string;
  onChange: (s: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options =
    kind === "job" ? jobSuggestions(value) : locationSuggestions(value);
  const Icon = kind === "job" ? Search : MapPin;
  function select(value: string) {
    onChange(value);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="search-field">
      <Icon size={21} aria-hidden="true" />
      <div>
        <label htmlFor={id}>
          {kind === "job" ? "What’s your next move?" : "Where feels like you?"}
        </label>
        <input
          id={id}
          value={value}
          placeholder={
            kind === "job"
              ? "Job title, skill or keyword"
              : "City, suburb or anywhere"
          }
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls={
            open && options.length > 0 ? `${id}-options` : undefined
          }
          aria-activedescendant={
            open && active >= 0 && active < options.length
              ? `${id}-${active}`
              : undefined
          }
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!options.length) {
                setActive(-1);
                return;
              }
              setOpen(true);
              setActive((a) =>
                e.key === "ArrowDown"
                  ? (a + 1) % options.length
                  : a <= 0
                    ? options.length - 1
                    : a - 1,
              );
            } else if (
              e.key === "Enter" &&
              open &&
              active >= 0 &&
              options[active]
            ) {
              e.preventDefault();
              select(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        {open && options.length > 0 && (
          <div
            className="suggestions"
            id={`${id}-options`}
            role="listbox"
            aria-label={
              kind === "job" ? "Job suggestions" : "Location suggestions"
            }
          >
            <span className="suggestion-label">
              {value ? "Suggestions" : "Popular searches"}
            </span>
            {options.slice(0, 6).map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "selected" : ""}
                id={`${id}-${index}`}
                key={option}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(option)}
              >
                {kind === "job" ? (
                  <TrendingUp size={15} />
                ) : (
                  <MapPin size={15} />
                )}
                <span>{option}</span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export function SearchBar({
  initialKeyword = "",
  initialLocation = "",
  onSearch,
  compact = false,
}: {
  initialKeyword?: string;
  initialLocation?: string;
  onSearch?: (keyword: string, location: string) => void;
  compact?: boolean;
}) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [location, setLocation] = useState(initialLocation);
  const router = useRouter();
  return (
    <form
      className={`search-bar ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (onSearch) onSearch(keyword, location);
        else {
          const params = new URLSearchParams();
          if (keyword) params.set("q", keyword);
          if (location) params.set("where", location);
          router.push(`/jobs?${params}`);
        }
      }}
    >
      <SuggestionInput kind="job" value={keyword} onChange={setKeyword} />
      <SuggestionInput
        kind="location"
        value={location}
        onChange={setLocation}
      />
      <button className="button primary search-submit" type="submit">
        Find my next role
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
