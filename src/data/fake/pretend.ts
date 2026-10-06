/**
 * The pretend Drive for this tab: kept in sessionStorage after every change,
 * so a reload finds what you did, as a real Drive would. A new situation
 * (or "Start again" in the demo panel) starts from Alex's folder.
 */
import { FakeDrive } from '../drive/fake-drive';
import type { Scenario, TimeScale } from '../demo/scenario';
import { BOWER_FOLDER } from '../vault/layout';
import { FakeRunService } from './fake-run-service';
import { seedFakeDrive } from './seed';

const FAKE_KEY = (scenario: Scenario): string => `bower:fake:${scenario}`;

export async function pretendDrive(scenario: Scenario): Promise<{ drive: FakeDrive; rootId: string | null; fresh: boolean }> {
  let drive: FakeDrive | null = null;
  try {
    const kept = sessionStorage.getItem(FAKE_KEY(scenario));
    if (kept) drive = FakeDrive.restore(kept);
  } catch (e) {
    console.error(e);
  }
  let rootId: string | null;
  const fresh = !drive;
  if (drive) {
    rootId = (await drive.listAll('root')).find((f) => f.folder && f.name === BOWER_FOLDER && f.parents[0] === 'root')?.id ?? null;
  } else {
    drive = new FakeDrive();
    rootId = await seedFakeDrive(drive, scenario, Date.now());
  }
  const d = drive;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void d.snapshot().then((json) => {
        try {
          sessionStorage.setItem(FAKE_KEY(scenario), json);
        } catch (e) {
          // Too big for this tab's storage: it starts again on the next reload.
          console.error(e);
        }
      });
    }, 250);
  };
  d.onChange = save;
  save();
  return { drive: d, rootId, fresh };
}

/** The pretend run service for this tab. Stub until the B path lands: kept nowhere, owns no run. */
export function pretendRuns(scenario: Scenario, drive: FakeDrive, fresh: boolean, scale: TimeScale): FakeRunService {
  void scenario;
  void fresh;
  return new FakeRunService({ drive, scale });
}

/** Forgets every pretend Drive of this tab, so the next start is Alex's folder again. */
export function forgetPretendDrive(): void {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('bower:fake:')) sessionStorage.removeItem(k);
  } catch {
    // expected: Nothing kept, nothing to forget.
  }
}

