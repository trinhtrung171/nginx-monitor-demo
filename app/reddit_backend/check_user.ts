import { db } from './src/db';
db.user.findFirst({ where: { username: 'FIRaci' } }).then(u => {
  console.log("Avatar:", u.avatarUrl);
  console.log("Banner:", u.bannerUrl);
}).finally(() => process.exit(0));
