import React, { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/** Campo de tags: aceita Enter ou vírgula para adicionar; clique no X remove. */
const TagsInput: React.FC<TagsInputProps> = ({ value, onChange, placeholder }) => {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (items.length) onChange([...value, ...items]);
    setDraft('');
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 focus-within:ring-2 focus-within:ring-cyan-500/50">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 text-cyan-300 text-xs px-2 py-0.5"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="hover:text-cyan-100"
              aria-label={`Remover ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none px-1 py-0.5"
        />
      </div>
    </div>
  );
};

export default TagsInput;
