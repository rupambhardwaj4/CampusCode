require('dotenv').config();

// Test the conversion logic directly
const testSql = `SELECT u.id, u.fullName,
  (SELECT GROUP_CONCAT(DISTINCT fa.subject || ' (' || fa.year || ' - ' || fa.section || ')')
   FROM faculty_assignments fa WHERE fa.user_id = u.id
  ) as assignments
FROM account_users u WHERE u.id = 1`;

// Replicate the conversion
function replaceGroupConcat(sql) {
    let out = String(sql || '');
    let result = '';
    let i = 0;
    
    while (i < out.length) {
        const remaining = out.substring(i);
        const gcMatch = remaining.match(/^([\s\S]*?)GROUP_CONCAT\s*\(/i);
        
        if (!gcMatch) {
            result += remaining;
            break;
        }
        
        result += gcMatch[1] + 'STRING_AGG(';
        i += gcMatch[0].length;
        
        // Find matching closing parenthesis
        let parenDepth = 1;
        let j = i;
        let inString = false;
        let stringChar = '';
        
        while (j < out.length && parenDepth > 0) {
            const char = out[j];
            
            if (inString) {
                if (char === stringChar && out[j-1] !== '\\') {
                    inString = false;
                }
            } else {
                if (char === '"' || char === "'" || char === '`') {
                    inString = true;
                    stringChar = char;
                } else if (char === '(') {
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                }
            }
            
            if (parenDepth > 0) j++;
        }
        
        if (parenDepth === 0) {
            const gcContent = out.substring(i, j);
            console.log('GROUP_CONCAT content:', gcContent);
            
            const parts = gcContent.match(/^(DISTINCT\s+)?(.*?)(?:,\s*'([^']*)'\s*)?$/i);
            
            if (parts) {
                const hasDistinct = parts[1] ? 'DISTINCT ' : '';
                const expression = parts[2].trim();
                const separator = parts[3] || ',';
                
                result += `${hasDistinct}(${expression})::text, '${separator}')`;
            } else {
                result += `(${gcContent})::text, ',')`;
            }
            
            i = j + 1;
        } else {
            result += out.substring(i);
            break;
        }
    }
    
    return result;
}

const converted = replaceGroupConcat(testSql);
console.log('Original SQL:');
console.log(testSql);
console.log('\nConverted SQL:');
console.log(converted);
