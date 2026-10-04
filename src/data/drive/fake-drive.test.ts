import { describeDriveContract } from './drive-contract';
import { FakeDrive } from './fake-drive';

describeDriveContract('fake', async () => {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  return { drive, root, failNext: (c) => drive.failNext(c), touch: async (id) => drive.touch(id) };
});
