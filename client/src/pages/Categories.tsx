import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { SkeletonList } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { type ConfirmRequest, ConfirmSheet } from '../components/Sheet.tsx';
import { Check, Pencil, Plus, Tag, Trash } from '../icons.tsx';
import type { CategoryWithCount } from '../types.ts';
import ui from '../ui.module.css';
import css from './Categories.module.css';

export function Categories() {
  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.categories();
      setCategories(data.categories);
    } catch (err) {
      setError(message(err, 'could not load categories'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      await api.createCategory(name);
      setNewName('');
      await load();
    } catch (err) {
      setError(message(err, 'could not add that category'));
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      await api.renameCategory(id, name);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(message(err, 'could not rename that category'));
    } finally {
      setBusy(false);
    }
  }

  // The count is the whole point of the warning: deleting untags those places.
  function askDelete(category: CategoryWithCount) {
    setConfirmRequest({
      title: `Delete ${category.name}?`,
      body: category.placeCount === 0
        ? 'No places use it, so nothing else changes.'
        : `${category.placeCount} ${category.placeCount === 1 ? 'place uses' : 'places use'} it. They stay, but lose ` +
          'this category.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setError(null);
        try {
          await api.deleteCategory(category.id);
          await load();
        } catch (err) {
          setError(message(err, 'could not delete that category'));
        }
      },
    });
  }

  return (
    <div>
      <h1 className={css.title}>Categories</h1>
      <p className={ui.metaQuiet}>Used to tag places and to filter them on the Places page.</p>

      <form className={css.addRow} onSubmit={add}>
        <input
          className={ui.input}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder='New category'
          aria-label='New category name'
          maxLength={40}
        />
        <button className={css.addButton} type='submit' disabled={busy || !newName.trim()}>
          <Plus size={20} />
          Add
        </button>
      </form>

      {error && <p className={ui.error}>{error}</p>}

      {!categories && !error && <SkeletonList count={3} />}

      {categories?.length === 0 && (
        <EmptyState
          icon={<Tag size={26} />}
          headline='No categories yet'
          body='Add the kinds of place your family visits, like park, museum or playground. You can then tag places with them.'
        />
      )}

      {categories?.map((c) => (
        <div key={c.id} className={css.item}>
          {editingId === c.id
            ? (
              <>
                <input
                  className={ui.input}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label={`Rename ${c.name}`}
                  maxLength={40}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button
                  type='button'
                  className={css.action}
                  aria-label='Save name'
                  disabled={busy || !editName.trim()}
                  onClick={() => saveRename(c.id)}
                >
                  <Check size={20} />
                </button>
              </>
            )
            : (
              <>
                <span className={css.itemBody}>
                  <span className={css.name}>{c.name}</span>
                  <span className={ui.metaQuiet}>
                    {c.placeCount} {c.placeCount === 1 ? 'place' : 'places'}
                  </span>
                </span>
                <button
                  type='button'
                  className={css.action}
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                >
                  <Pencil size={20} />
                </button>
                <button
                  type='button'
                  className={css.actionDanger}
                  aria-label={`Delete ${c.name}`}
                  onClick={() => askDelete(c)}
                >
                  <Trash size={20} />
                </button>
              </>
            )}
        </div>
      ))}

      <ConfirmSheet request={confirmRequest} onDismiss={() => setConfirmRequest(null)} />
    </div>
  );
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
