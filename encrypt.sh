#!/bin/bash
DATE=$1
TYPE=$2
SUPPLIER_REF=CP0001
NAME="${SUPPLIER_REF}_ALL_L702_${TYPE}_${DATE}_1_1.txt"

gpg --batch --yes --recipient $GPG_RECIPIENT --output "$NAME.pgp" --encrypt "$NAME"