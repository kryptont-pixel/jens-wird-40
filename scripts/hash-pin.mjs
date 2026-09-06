import bcrypt from "bcryptjs";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
process.stdout.write("Sechsstellige Admin-PIN eingeben (wird nicht gespeichert): ");
let pin = "";
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  for await (const chunk of process.stdin) {
    const key = chunk.toString();
    if (key === "\r" || key === "\n") break;
    if (key === "\u0003") process.exit(130);
    if (key === "\u007f" || key === "\b") { pin = pin.slice(0, -1); continue; }
    pin += key;
  }
  process.stdin.setRawMode(false);
  process.stdin.pause();
} else {
  pin = await new Promise((resolve) => rl.question("", resolve));
}
rl.close();
process.stdout.write("\n");
if (!/^\d{6}$/.test(pin)) throw new Error("Die PIN muss aus genau sechs Ziffern bestehen.");
console.log(await bcrypt.hash(pin, 12));
