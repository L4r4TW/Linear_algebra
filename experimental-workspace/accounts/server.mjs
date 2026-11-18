import { createAccountRuntime } from './runtime.mjs';
const { app, db } = await createAccountRuntime();
app.listen(3000, '0.0.0.0', () => console.log('Private account practice backend ready.'));
const stop = () =>
  app.close(async () => {
    await db.close();
    process.exit(0);
  });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
