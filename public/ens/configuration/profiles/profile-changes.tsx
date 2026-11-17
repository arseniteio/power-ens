import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ENSListedProfile } from '../../../../common/ens/profiles/builtin';
import type { ENSProfile, ENSProfileVersion } from '../../../../common/ens/profiles/types';
import { profilesClient } from './profiles-client';

export type ENSStagedChange =
  | { kind: 'upsert'; profile: ENSProfile; expectedVersion: ENSProfileVersion | null | undefined; isNew: boolean }
  | { kind: 'delete'; id: string; name: string; restoresBuiltin: boolean; expectedVersion: ENSProfileVersion | undefined };

export interface ENSWorkingProfile extends ENSListedProfile {
  staged?: 'new' | 'changed' | 'deleted';
}

interface ProfileChangesState {
  loading: boolean;
  loadError?: string;
  canChange: boolean;
  listed: ENSListedProfile[];
  working: ENSWorkingProfile[];
  changes: ENSStagedChange[];
  saving: boolean;
  saveError?: string;
  savedAt?: number;
  reload: () => Promise<void>;
  stageUpsert: (profile: ENSProfile) => void;
  stageDeletion: (id: string) => void;
  unstage: (id: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  editorDrafts: Map<string, unknown>;
}

const ProfileChangesContext = createContext<ProfileChangesState | undefined>(undefined);

const changeId = (change: ENSStagedChange): string => (change.kind === 'upsert' ? change.profile.id : change.id);

// A stored profile is what the version guard protects; a built-in one has no document yet.
const storedEntry = (listed: ENSListedProfile[], id: string): ENSListedProfile | undefined =>
  listed.find(entry => entry.profile.id === id && entry.origin !== 'builtin');

export const ProfileChangesProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [listed, setListed] = useState<ENSListedProfile[]>([]);
  const [canChange, setCanChange] = useState(false);
  const [changes, setChanges] = useState<ENSStagedChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [savedAt, setSavedAt] = useState<number | undefined>();
  // An open profile editor keeps its unstaged edits here, so leaving the tab does not lose them.
  const editorDrafts = useRef(new Map<string, unknown>()).current;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await profilesClient.list();
      setListed(result.profiles);
      setCanChange(result.canChange);
      setLoadError(undefined);
    } catch (error: any) {
      setLoadError(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!changes.length) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);

  const stageUpsert = useCallback(
    (profile: ENSProfile) => {
      const stored = storedEntry(listed, profile.id);
      setSaveError(undefined);
      setChanges(previous => [
        ...previous.filter(change => changeId(change) !== profile.id),
        { kind: 'upsert', profile, expectedVersion: stored ? stored.version : null, isNew: !listed.some(entry => entry.profile.id === profile.id) },
      ]);
    },
    [listed]
  );

  const stageDeletion = useCallback(
    (id: string) => {
      const stored = storedEntry(listed, id);
      setSaveError(undefined);
      setChanges(previous => {
        const rest = previous.filter(change => changeId(change) !== id);
        return stored ? [...rest, { kind: 'delete', id, name: stored.profile.name, restoresBuiltin: stored.origin === 'override', expectedVersion: stored.version }] : rest;
      });
    },
    [listed]
  );

  const unstage = useCallback((id: string) => setChanges(previous => previous.filter(change => changeId(change) !== id)), []);

  const discard = useCallback(() => {
    setChanges([]);
    setSaveError(undefined);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await profilesClient.apply(
        changes.filter((c): c is Extract<ENSStagedChange, { kind: 'upsert' }> => c.kind === 'upsert').map(c => ({ profile: c.profile, expectedVersion: c.expectedVersion })),
        changes.filter((c): c is Extract<ENSStagedChange, { kind: 'delete' }> => c.kind === 'delete').map(c => ({ id: c.id, expectedVersion: c.expectedVersion }))
      );
      setChanges([]);
      setSavedAt(Date.now());
      await reload();
      return true;
    } catch (error: any) {
      setSaveError(error?.message || String(error));
      return false;
    } finally {
      setSaving(false);
    }
  }, [changes, reload]);

  const working = useMemo<ENSWorkingProfile[]>(() => {
    const out: ENSWorkingProfile[] = listed.map(entry => {
      const change = changes.find(c => changeId(c) === entry.profile.id);
      if (!change || entry.errors.length) return entry;
      if (change.kind === 'delete') return { ...entry, staged: 'deleted' };
      return { ...entry, profile: change.profile, staged: 'changed', errors: [] };
    });
    changes
      .filter((c): c is Extract<ENSStagedChange, { kind: 'upsert' }> => c.kind === 'upsert' && c.isNew)
      .forEach(c => out.push({ profile: c.profile, origin: 'stored', errors: [], staged: 'new' }));
    return out;
  }, [listed, changes]);

  const value: ProfileChangesState = {
    loading,
    loadError,
    canChange,
    listed,
    working,
    changes,
    saving,
    saveError,
    savedAt,
    reload,
    stageUpsert,
    stageDeletion,
    unstage,
    discard,
    save,
    editorDrafts,
  };

  return <ProfileChangesContext.Provider value={value}>{children}</ProfileChangesContext.Provider>;
};

export const useProfileChanges = (): ProfileChangesState => {
  const state = useContext(ProfileChangesContext);
  if (!state) throw new Error('useProfileChanges needs a ProfileChangesProvider');
  return state;
};
