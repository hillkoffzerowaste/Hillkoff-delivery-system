const { execSync } = require('child_process');

try {
  console.log('=== Git Log (Last 10) ===');
  console.log(execSync('git log --oneline -10').toString());
  
  console.log('\n=== Git Status ===');
  console.log(execSync('git status --short').toString());
  
  console.log('\n=== Git Diff Stat ===');
  console.log(execSync('git diff --cached --stat').toString());
} catch (e) {
  console.error(e.message);
}
