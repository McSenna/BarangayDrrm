<?php
const HOUSEHOLD_REPORTED_CATEGORY_FIELDS = ['children_count','seniors_count','pwd_count','pregnant_count','medical_needs_count','other_vulnerable_count'];

/** Declared totals are historical information, never verified scoring inputs. */
function household_reported_counts(array $data): array {
    $out=[];
    foreach (array_merge(['number_of_members','vulnerable_members'],HOUSEHOLD_REPORTED_CATEGORY_FIELDS) as $field) {
        $value=$data[$field] ?? ($field === 'number_of_members' ? null : 0);
        if (is_bool($value) || !is_scalar($value) || filter_var($value,FILTER_VALIDATE_INT) === false || (int)$value < ($field === 'number_of_members' ? 1 : 0) || (int)$value > 2147483647) {
            throw new InvalidArgumentException($field === 'number_of_members' ? 'Reported household size must be a whole number of at least 1.' : 'Reported vulnerability counts must be non-negative whole numbers.');
        }
        $out[$field]=(int)$value;
    }
    foreach (array_merge(['vulnerable_members'],HOUSEHOLD_REPORTED_CATEGORY_FIELDS) as $field) {
        if ($out[$field]>$out['number_of_members']) throw new InvalidArgumentException('A reported vulnerability count cannot exceed the reported household size. One person can appear in several categories.');
    }
    return $out;
}

function household_counts_from_verified_profile(array $profile): array {
    if (!$profile['complete']) throw new InvalidArgumentException('The household roster must be complete.');
    $out=['number_of_members'=>$profile['size'],'vulnerable_members'=>$profile['vulnerable']];
    $map=array_combine(HOUSEHOLD_REPORTED_CATEGORY_FIELDS,HOUSEHOLD_VULNERABILITY_FLAGS);
    foreach ($map as $column=>$flag) $out[$column]=array_sum(array_map(fn($person)=>(int)$person[$flag],$profile['people']));
    return $out;
}
