const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } = require('docx');

const createBracketPlaceholder = (text) => new Paragraph({
    children: [new TextRun(`[${text}]`)]
});

const bodyTable = new Table({
    rows: [
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("Item")] }),
                new TableCell({ children: [new Paragraph("Descrição / Deliberação")] }),
                new TableCell({ children: [new Paragraph("Responsável")] }),
                new TableCell({ children: [new Paragraph("Prazo")] }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("1")] }),
                new TableCell({ children: [new Paragraph("{#itens_reuniao}{titulo}")] }),
                new TableCell({ children: [new Paragraph("Responsável")] }),
                new TableCell({ children: [new Paragraph("{prazo}{/itens_reuniao}")] }),
            ]
        })
    ]
});

const participantesTable = new Table({
    rows: [
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("{#participantes}")] }),
                new TableCell({ children: [new Paragraph("{nome}")] }),
                new TableCell({ children: [new Paragraph("{email}")] }),
                new TableCell({ children: [new Paragraph("{/participantes}")] }),
            ]
        })
    ]
});

const emptyTable = new Table({
    rows: [
        new TableRow({ children: [new TableCell({ children: [new Paragraph("A")] })] }),
        new TableRow({ children: [new TableCell({ children: [new Paragraph("B")] })] })
    ]
});

const doc = new Document({
    sections: [{
        children: [
            createBracketPlaceholder('CÓDIGO DA OBRA'),
            createBracketPlaceholder('NOME DA OBRA'),
            createBracketPlaceholder('ASSUNTO'),
            createBracketPlaceholder('SERVIÇO'),
            createBracketPlaceholder('FORNECEDOR'),
            createBracketPlaceholder('EXTRAIR DO FIRE FLIES'),
            new Paragraph("---"),
            emptyTable,
            participantesTable,
            bodyTable,
            emptyTable,
            emptyTable
        ],
    }]
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync('fixtures/ATA_MODELO.docx', buffer);
    console.log('Created fixtures/ATA_MODELO.docx');
});
