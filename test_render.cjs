const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");

const content = fs.readFileSync("fixtures/ATA_MODELO.docx");
const zip = new PizZip(content);

const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
});

doc.render({
    participantes: [
        {
            nome: 'Thais Louise Barroso',
            email: 'thais.barroso@afonsofranca.com.br'
        }
    ]
});

const buf = doc.getZip().generate({ type: "nodebuffer" });
fs.writeFileSync("output.docx", buf);
console.log("Rendered!");
