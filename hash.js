/**
 * KSRMS Technologies — Password Hash Generator
 * Usage: node hash.js
 * Then copy the hash and run the INSERT SQL shown below.
 */
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Enter the password you want to hash: ', async (password) => {
  if (!password || password.trim().length < 6) {
    console.error('Password must be at least 6 characters.');
    rl.close();
    return;
  }
  const hash = await bcrypt.hash(password.trim(), 12);
  console.log('\n✅ Password hash generated successfully!\n');
  console.log('Hash:', hash);
  console.log('\n📋 Copy and run this SQL in your database:\n');
  console.log(`INSERT INTO admins (username, password_hash, role, first_name, last_name, email, is_first_login)`);
  console.log(`VALUES ('superadmin', '${hash}', 'SuperAdmin', 'KSRMS', 'Admin', 'info@ksrms.com.ng', 0);`);
  console.log('\n⚠️  Keep this hash private. Never share it.\n');
  rl.close();
});
