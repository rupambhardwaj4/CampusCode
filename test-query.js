require('dotenv').config();
const db = require('./db');

db.all(`
  SELECT u.id, u.fullName,
    (SELECT GROUP_CONCAT(DISTINCT fa.subject || ' (' || fa.year || ' - ' || fa.section || ')')
     FROM faculty_assignments fa WHERE fa.user_id = u.id
    ) as assignments
  FROM account_users u WHERE u.id = 1
`, [], (err, rows) => {
  if (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  } else {
    console.log('✅ Query successful');
    console.log('Result:', rows);
  }
  process.exit(err ? 1 : 0);
});
