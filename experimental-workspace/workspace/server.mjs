import { createApp } from './server/http-app.mjs';

createApp().listen(3000, '0.0.0.0', () => {
  console.log('Experimental workspace listening on port 3000');
});
