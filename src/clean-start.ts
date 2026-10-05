// Imported first by main.tsx, so it runs before any store reads the device's storage.
import { startCleanIfNewSituation } from '@/data/demo/scenario';

startCleanIfNewSituation();
