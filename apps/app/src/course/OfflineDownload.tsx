import type { Course } from '@golf/course-schema';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { colors } from '../theme';
import { downloadForOffline, isDownloaded, offlineSupported } from './offline';

type S =
  | { kind: 'idle' }
  | { kind: 'busy'; pct: number }
  | { kind: 'done' }
  | { kind: 'error'; msg: string };

export function OfflineDownload({ course }: { course: Course }) {
  const [s, setS] = useState<S>({ kind: 'idle' });
  useEffect(() => {
    if (offlineSupported())
      isDownloaded(course.id, course.version).then(
        (d) => d && setS({ kind: 'done' }),
        () => {},
      );
  }, [course.id, course.version]);
  if (!offlineSupported() || !course.imagery)
    return (
      <Text style={{ color: colors.muted, fontSize: 12 }}>Offline maps aren’t available here.</Text>
    );
  if (s.kind === 'done')
    return <Text style={{ color: colors.accent }}>✓ Course saved for offline use</Text>;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Download course for offline"
        disabled={s.kind === 'busy'}
        onPress={() => {
          setS({ kind: 'busy', pct: 0 });
          downloadForOffline(course.id, course.version, {
            onProgress: (d, t) => setS({ kind: 'busy', pct: Math.round((100 * d) / t) }),
          }).then(
            () => setS({ kind: 'done' }),
            (e: Error) => setS({ kind: 'error', msg: e.message }),
          );
        }}
        style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14 }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {s.kind === 'busy' ? `Downloading… ${s.pct}%` : 'Download for offline (≈6 MB)'}
        </Text>
      </Pressable>
      {s.kind === 'error' && <Text style={{ color: colors.warn, fontSize: 12 }}>{s.msg}</Text>}
    </>
  );
}
