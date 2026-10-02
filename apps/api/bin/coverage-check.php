<?php

declare(strict_types=1);

// Falla si la cobertura de líneas del informe Clover queda por debajo del umbral.
// Uso: php bin/coverage-check.php var/coverage/clover.xml 75

[, $file, $threshold] = $argv + [null, null, null];

if (!is_string($file) || !is_file($file) || !is_numeric($threshold)) {
    fwrite(\STDERR, "Uso: php bin/coverage-check.php <clover.xml> <umbral>\n");
    exit(2);
}

$metrics = new SimpleXMLElement((string) file_get_contents($file))->project->metrics;
$total = (int) $metrics['statements'];
$covered = (int) $metrics['coveredstatements'];
$percentage = 0 === $total ? 100.0 : $covered / $total * 100;

printf("Cobertura de líneas: %.2f %% (mínimo %s %%)\n", $percentage, $threshold);

exit($percentage >= (float) $threshold ? 0 : 1);
